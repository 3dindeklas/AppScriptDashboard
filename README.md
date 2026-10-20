# Workshopkompas · Google Apps Script-dashboard

Workshopkompas combineert de workshopgegevens van alle tech-hubs in één afgeschermd, filterbaar dashboard. Na het invullen van één toegestaan Google-account start de app met fictieve demogegevens en kan daarna Google Sheets met dezelfde kolomstructuur uitlezen.

De server normaliseert de volledige analysekolomstructuur naar één intern workshopmodel. Alleen de velden voor de huidige interface en filters worden via een vaste allowlist doorgestuurd; uitgebreidere cijfers volgen per roadmapstap.

## Wat het dashboard doet

- standaard Apps Script `doGet()` met `createTemplateFromFile('Index').evaluate()`;
- standaard publieke `include(filename)` voor `Styles.html` en `Client.html`;
- één account-allowlist voor het dashboard en een aparte financiële allowlist in `Config.gs`;
- toegangscontrole bij de pagina, HTML-includes en iedere data-aanvraag;
- onafhankelijke laadstatus en datakwaliteit per Google-bron;
- beschikbare data blijft zichtbaar wanneer één bron uitvalt;
- maximaal 5.000 regels per bron, configureerbaar tot een harde grens van 10.000;
- formule-only rijen worden via één compacte ankerscan vóór de brede data-import genegeerd en verbruiken de rijlimiet niet;
- een gecomprimeerde, server-side snapshot voorkomt dat beide Sheets bij iedere opening opnieuw worden gescand;
- handmatig vernieuwen en een optionele tijdtrigger vervangen de snapshot bewust;
- gegevens asynchroon ophalen met `google.script.run`;
- zichtbare laadstatus met spinner, stapsgewijze feedback en de werkelijk gemeten laadtijd;
- negen combineerbare filters: tech-hub, schooljaar, regio, PO/VO, aanbieder, workshop, statusgroep, school en type;
- een inklapbare filterzijbalk, broninformatie onder **Data** en een korte actualiteitsmelding;
- afzonderlijk aan- en uitzetten van dashboardonderdelen via **Weergave**, ook voor screenshots en afdrukken;
- inclusief maandbereik op aanvraagdatum of één van de definitieve lesdagen en een bereik voor leerlingaantallen;
- expliciete keuzes om regels zonder datum of leerlingaantal wel of niet mee te nemen;
- zeven gefilterde kerncijfers en een vergelijking tussen de tech-hubs;
- een standaard ingeklapt financieel overzicht met kosten, facturatie, marge en volledigheid, uitsluitend voor apart toegestane accounts;
- een maandgrafiek voor aanvragen, leerlingdeelnames en lesmomenten per tech-hub;
- verdelingen voor PO/VO, regio, workshop, aanbieder en statusgroep;
- gewogen PO- en VO-leerjaren, inclusief combinatiegroepen en onbekende waarden;
- twee leerjaartaarten met gewogen aantallen en percentages, in één PO/VO-blok;
- donuts met aantallen en percentages voor PO/VO en statusgroepen;
- een gemeentekaart met kleurintensiteit, aantallen, lokale gemeentegrenzen en een landelijke weergave;
- de gemeentelijke staafgrafiek gelijktijdig naast de kaart en een introductieblok met actieve filters en snelle schooljaarknoppen;
- een toegankelijke tabelweergave onder iedere grafiek en een recente-workshoptabel;
- visuele afstemming op de 3Dindeklas Foundation, zonder externe CSS- of JavaScript-bibliotheek;
- responsive bediening voor telefoon, tablet en desktop, met respect voor minder beweging;
- een afdruk- en PDF-weergave voor een compact A4-landscapeoverzicht;
- uitsluitend centraal toegestane analysevelden naar de browser; geen namen van contactpersonen, e-mailadressen, telefoonnummers, notities of technische ID's;
- demomodus zonder databronnen, maar nooit zonder toegangscontrole.

Microsoft 365 en verschillende rollen zijn bewust nog niet opgenomen. Microsoft volgt als stap 10 zodra de koppeling met een testaccount gecontroleerd kan worden.

## Bestanden

| Bestand | Omgeving | Functie |
| --- | --- | --- |
| `Config.gs` | server | enige configuratieplek, inclusief toegestane accounts |
| `Code.gs` | server | toegang, `doGet`, `include` en `getDashboardData` |
| `Data.gs` | server | Google Sheets lezen, normaliseren en browservelden toestaan |
| `Cache.gs` | server | privacyveilige snapshots, compressie, locking en herstel bij een cache-miss |
| `Index.html` | browser | paginastructuur |
| `Styles.html` | browser | CSS binnen een `<style>`-tag |
| `Municipalities.html` | browser | openbare, vereenvoudigde gemeentegrenzen als JSON; bevat geen workshopgegevens |
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

Gebruik voor publicatie, acceptatietest, beheer en rollback de [productie- en beheerhandleiding](docs/PRODUCTIE.md).

De [kaarthandleiding](docs/GEMEENTEKAART.md) beschrijft gemeentekoppeling, bronvermelding en het bijwerken van de openbare kaartasset. Kaart en donuts volgen dezelfde actieve filters als de rest van het dashboard.

Zie [Compact dashboard en screenshots](docs/WEERGAVE.md) voor de navigatie, zijbalk en weergavekeuze.

## Stapsgewijs uitbreiden

De oorspronkelijke dashboardfuncties komen terug via afzonderlijke, opeenvolgende pull requests. Zie [docs/ROADMAP.md](docs/ROADMAP.md) voor de volgorde, acceptatiecriteria en vaste controle per stap.

## Officiële basis

De pagina gebruikt de [3Dindeklas Foundation](https://3dindeklas.github.io/Foundation/) voor kleur, vorm, header en toegankelijkheidsafspraken. De Apps Script-structuur volgt deze Google-documentatie:

- [HTML Service: Best Practices](https://developers.google.com/apps-script/guides/html/best-practices)
- [HTML Service: Templated HTML](https://developers.google.com/apps-script/guides/html/templates)
- [Communicate with Server Functions](https://developers.google.com/apps-script/guides/html/communication)
- [Web Apps](https://developers.google.com/apps-script/guides/web)
- [Session](https://developers.google.com/apps-script/reference/base/session)
- [Cache Service](https://developers.google.com/apps-script/reference/cache/cache-service)
- [Lock Service](https://developers.google.com/apps-script/reference/lock)
- [Installable Triggers](https://developers.google.com/apps-script/guides/triggers/installable)
