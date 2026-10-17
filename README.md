# Workshopkompas · minimale Apps Script-basis

Deze branch bouwt het dashboard opnieuw op vanaf een kleine, controleerbare basis. Na het invullen van één toegestaan Google-account start de app met fictieve demogegevens en kan daarna één of twee Google Sheets met dezelfde kolomstructuur uitlezen.

De server normaliseert de volledige analysekolomstructuur naar één intern workshopmodel. Alleen de velden voor de huidige interface en filters worden via een vaste allowlist doorgestuurd; uitgebreidere cijfers volgen per roadmapstap.

## Wat versie 1 doet

- standaard Apps Script `doGet()` met `createTemplateFromFile('Index').evaluate()`;
- standaard publieke `include(filename)` voor `Styles.html` en `Client.html`;
- één expliciete account-allowlist in `Config.gs`;
- toegangscontrole bij de pagina, HTML-includes en iedere data-aanvraag;
- onafhankelijke laadstatus en datakwaliteit per Google-bron;
- beschikbare data blijft zichtbaar wanneer één bron uitvalt;
- maximaal 5.000 regels per bron, configureerbaar tot een harde grens van 10.000;
- formule-only rijen worden via één compacte ankerscan vóór de brede data-import genegeerd en verbruiken de rijlimiet niet;
- gegevens asynchroon ophalen met `google.script.run`;
- zichtbare laadstatus met spinner, stapsgewijze feedback en de werkelijk gemeten laadtijd;
- negen combineerbare filters: stichting, schooljaar, regio, PO/VO, aanbieder, workshop, statusgroep, school en type;
- inclusief maandbereik op aanvraagdatum of één van de definitieve lesdagen en een bereik voor leerlingaantallen;
- expliciete keuzes om regels zonder datum of leerlingaantal wel of niet mee te nemen;
- zeven gefilterde kerncijfers en een vergelijking tussen de stichtingen;
- een standaard ingeklapt financieel overzicht met kosten, facturatie, marge en volledigheid;
- een maandgrafiek voor aanvragen, leerlingdeelnames en lesmomenten per stichting;
- verdelingen voor PO/VO, regio, workshop, aanbieder en statusgroep;
- gewogen PO- en VO-leerjaren, inclusief combinatiegroepen en onbekende waarden;
- een toegankelijke tabelweergave onder iedere grafiek en een recente-workshoptabel;
- uitsluitend centraal toegestane analysevelden naar de browser; geen namen van contactpersonen, e-mailadressen, telefoonnummers, notities of technische ID's;
- demomodus zonder databronnen, maar nooit zonder toegangscontrole.

Microsoft 365 en verschillende rollen zijn bewust nog niet opgenomen. Die voegen we pas in de bijbehorende roadmapstap toe.

## Bestanden

| Bestand | Omgeving | Functie |
| --- | --- | --- |
| `Config.gs` | server | enige configuratieplek, inclusief toegestane accounts |
| `Code.gs` | server | toegang, `doGet`, `include` en `getDashboardData` |
| `Data.gs` | server | Google Sheets lezen, normaliseren en browservelden toestaan |
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

Volg [docs/INSTALLATIE.md](docs/INSTALLATIE.md). Vul eerst je Google-account in, begin met `demoMode: true` en koppel pas daarna een Google Sheet.

## Stapsgewijs uitbreiden

De oorspronkelijke dashboardfuncties komen terug via afzonderlijke, opeenvolgende pull requests. Zie [docs/ROADMAP.md](docs/ROADMAP.md) voor de volgorde, acceptatiecriteria en vaste controle per stap.

## Officiële basis

De structuur volgt deze Google-documentatie:

- [HTML Service: Best Practices](https://developers.google.com/apps-script/guides/html/best-practices)
- [HTML Service: Templated HTML](https://developers.google.com/apps-script/guides/html/templates)
- [Communicate with Server Functions](https://developers.google.com/apps-script/guides/html/communication)
- [Web Apps](https://developers.google.com/apps-script/guides/web)
- [Session](https://developers.google.com/apps-script/reference/base/session)
