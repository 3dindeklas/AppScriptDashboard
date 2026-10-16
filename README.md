# Workshopkompas · minimale Apps Script-basis

Deze branch bouwt het dashboard opnieuw op vanaf een kleine, controleerbare basis. De app start direct met fictieve demogegevens en kan daarna één of twee Google Sheets met dezelfde kolomstructuur uitlezen.

De server normaliseert de volledige analysekolomstructuur inmiddels naar één intern recordmodel. Alleen de kleine, veilige browserprojectie van de minimale interface wordt nog doorgestuurd; uitgebreidere filters en cijfers volgen per roadmapstap.

## Wat versie 1 doet

- standaard Apps Script `doGet()` met `createTemplateFromFile('Index').evaluate()`;
- standaard publieke `include(filename)` voor `Styles.html` en `Client.html`;
- gegevens asynchroon ophalen met `google.script.run`;
- drie filters: stichting, status en PO/VO;
- kerncijfers, twee eenvoudige staafgrafieken en een recente-workshoptabel;
- uitsluitend analysevelden naar de browser; geen namen, e-mailadressen, telefoonnummers, notities of technische ID's;
- direct werkende demomodus zonder accounts of databronnen.

Microsoft 365, eigen toegangsallowlists, financiële rapportages, uitgebreide grafieken en range sliders zijn bewust nog niet opgenomen. Die voegen we pas toe nadat deze basis in Apps Script werkt.

## Bestanden

| Bestand | Omgeving | Functie |
| --- | --- | --- |
| `Config.gs` | server | enige configuratieplek |
| `Code.gs` | server | `doGet`, `include` en `getDashboardData` |
| `Data.gs` | server | Google Sheets lezen en veilige velden normaliseren |
| `Index.html` | browser | paginastructuur |
| `Styles.html` | browser | CSS binnen een `<style>`-tag |
| `Client.html` | browser | browser-JavaScript binnen een `<script>`-tag |

Browserobjecten zoals `document` en `window` mogen alleen in de HTML-bestanden staan.

## Lokaal controleren

Node.js 20 of nieuwer is voldoende; er zijn geen packages nodig.

```sh
npm run check
npm test
npm run preview:build
```

Open daarna `preview/index.html`. De preview bevat uitsluitend fictieve gegevens.

## Installeren

Volg [docs/INSTALLATIE.md](docs/INSTALLATIE.md). Begin altijd met `demoMode: true`; koppel pas daarna een Google Sheet.

## Stapsgewijs uitbreiden

De oorspronkelijke dashboardfuncties komen terug via afzonderlijke, opeenvolgende pull requests. Zie [docs/ROADMAP.md](docs/ROADMAP.md) voor de volgorde, acceptatiecriteria en vaste controle per stap.

## Officiële basis

De structuur volgt deze Google-documentatie:

- [HTML Service: Best Practices](https://developers.google.com/apps-script/guides/html/best-practices)
- [HTML Service: Templated HTML](https://developers.google.com/apps-script/guides/html/templates)
- [Communicate with Server Functions](https://developers.google.com/apps-script/guides/html/communication)
- [Web Apps](https://developers.google.com/apps-script/guides/web)
