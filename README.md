# Workshopkompas · AppScriptDashboard

Een besloten, Nederlandstalig HTML-dashboard in **Google Apps Script** dat workshopaanvragen uit meerdere Google Sheets en Microsoft 365 Excel-tabellen samenbrengt. GitHub bewaart uitsluitend de code en fictieve voorbeelden. Geen GitHub Pages, publieke datafeeds, externe fonts, analytics of grafiek-CDN’s.

## Wat je krijgt

- Kerncijfers: aanvragen, leerlingdeelnames, scholen, lesmomenten, uitgevoerd en aanvragen per school; ook gemiddeld leerlingaantal per aanvraag.
- Dropdowns voor stichting, schooljaar, gemeente, PO/VO, aanbieder, workshop, statusgroep, school en type.
- Schuifregelaars voor de maandperiode en het leerlingaantal; onbekende waarden expliciet in-/uitsluiten.
- Keuze tussen **Datum aanvraag** en **Definitieve datum** als basis voor periode en schooljaar.
- Maandgrafiek per stichting, onderwijsverdeling, gemeenten, workshops, aanbieders, statussen en gewogen leerjaren.
- Vergelijking tussen stichtingen en uitklapbare financiën/datakwaliteit.
- Responsive CSS, toetsenbordbediening, tekstwaarden bij grafieken en respect voor reduced motion.
- Google Sheets-adapter en Microsoft Graph-adapter voor benoemde Excel-tabellen, met server-side OAuth en paginering.
- Expliciete demo met **163 fictieve aanvragen**; een live bronfout vervangt nooit cijfers door demo-inhoud.

**Status:** eerste implementatie. Geautomatiseerde tests en syntaxcontrole zijn uitgevoerd. Live Google/Microsoft-authenticatie, deployment en visuele browsercontrole moeten nog in de eigen omgeving worden uitgevoerd. Er is niets live gepubliceerd.

## Snel bekijken zonder accounts

Node.js 20 of hoger; geen npm dependencies nodig:

```sh
npm run check
npm test
npm run preview:build
```

Open `preview/index.html` lokaal in een browser. Deze preview bevat alleen fictieve gegevens en staat in `.gitignore`. De preview is niet geschikt als productiehosting; de echte interface loopt via Apps Script.

## Installeren

Zie **[de installatiehandleiding](docs/INSTALLATIE.md)** voor Google Apps Script, bronconfiguratie, toegang en Microsoft 365-aanmelding. **[Datadefinities](docs/DATADEFINITIES.md)** beschrijft exact wat we tellen en hoe ontbrekende waarden, combinatiegroepen en dubbele ID’s worden behandeld.

Standaard is `demoMode: true` en is de toegangsallowlist leeg. Daardoor werkt een Apps Script-deployment pas nadat een beheerder toegang heeft ingesteld. De lokale fictieve preview vereist geen account.

## Projectindeling

| Bestand | Functie |
| --- | --- |
| `src/Config.gs` | Publieke defaults, bronvoorbeelden, statusgroepen en kolomaliassen |
| `src/Code.gs` | Toegangscontrole, HTML en één beveiligde data-RPC |
| `src/Sources.gs` | Google Sheets en Microsoft Excel uitlezen |
| `src/Microsoft.gs` | Beheerderaanmelding, tokenvernieuwing en ontkoppeling |
| `src/Normalize.gs` | Kolommapping, parsing en expliciete privacy-allowlist |
| `src/Demo.gs` | Fictieve voorbeeldgegevens |
| `src/Index.html`, `Styles.html`, `Client.html` | Interface en filters |
| `src/Analytics.html` | Zuivere filter- en rekenfuncties |
| `src/appsscript.json` | Runtime, minimale Google-scopes en uitvoeringsidentiteit |
| `tests/` | Regressietests met Node, inclusief toegang en providerfouten |
| `.github/workflows/check.yml` | Automatische controle bij pull requests |

## Toegang en gegevens

De app voert uit als **de bezoekende gebruiker** en controleert diens exacte Google-e-mailadres bij het laden van de pagina én bij elke data-aanvraag. Accounts buiten de allowlist worden geweigerd. Een ontbrekend e-mailadres geeft nooit toegang.

Iedere toegelaten gebruiker mag in deze versie **alle geconfigureerde brongegevens en financiële cijfers** zien. Filters zijn geen autorisatiegrenzen. Bron- of rolgebonden rechten zijn niet geïmplementeerd. Geef alleen toegang aan mensen die het gecombineerde overzicht mogen zien.

De server stuurt alleen analysevelden naar de browser: onder andere schoolnaam, regio, workshop, datums, aantallen, status en financiële totalen. Contactpersonen, e-mailadressen, telefoonnummers, locaties, notities, debugvelden, aanvraag-ID’s en mail-/kalender-ID’s worden niet meegestuurd. Analysegegevens blijven gevoelig: bevoegde bezoekers kunnen de ontvangen gegevens in hun browser inspecteren. Ze worden niet opgeslagen in localStorage, cookies of een service worker.

Google Sheets wordt gelezen met de rechten van de bezoeker. Microsoft wordt gelezen met de gedeelde, door de beheerder gekoppelde Microsoft-identiteit. Microsoft-tokens blijven in Script Properties en de servercache; alleen vertrouwde beheerders mogen het Apps Script-project bewerken. Kopieer geen echte configuratie of gegevens naar deze publieke repository.
