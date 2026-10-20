# Gefaseerde uitbreidingsroadmap

De minimale dashboardbasis uit PR #4 is het vaste vertrekpunt. We bouwen de oorspronkelijke visie terug in kleine pull requests. Iedere PR moet zelfstandig te beoordelen, te testen en terug te draaien zijn.

## Werkwijze per stap

Voor iedere stap gebruiken we dezelfde volgorde:

1. De vorige PR is gemerged en `main` is groen.
2. Maak een nieuwe branch vanaf de nieuwste `main`.
3. Voeg uitsluitend de functionaliteit van die stap toe.
4. Werk demogegevens en geautomatiseerde tests tegelijk bij.
5. Voer `npm run check`, `npm test` en `npm run preview:build` uit.
6. Test de opgeslagen versie handmatig via de Apps Script `/dev`-URL.
7. Zet de testuitkomst in de PR; merge pas na review.
8. Maak indien nodig een nieuwe Apps Script-versie en controleer de `/exec`-URL.

We starten geen volgende featurebranch voordat de voorgaande PR is gemerged. Daardoor ontstaan geen gestapelde PR's en blijft elke wijziging overzichtelijk.

## Vaste grenzen

- Geen echte spreadsheet-ID's, OAuth-tokens, persoonsgegevens of productiedata in GitHub.
- `.gs` bevat alleen servercode; `document` en `window` blijven in `.html`.
- `Index.html` gebruikt alleen de officiële `include(filename)`-opzet.
- Browserdata wordt asynchroon geladen met `google.script.run`.
- De demomodus moet na iedere PR blijven werken.
- Een nieuwe databron levert hetzelfde genormaliseerde recordformaat als de bestaande bron.
- Een PR bevat geen vooruitgeschoven functionaliteit uit een latere stap.
- Veranderingen aan tellingen of definities worden vastgelegd in `DATADEFINITIES.md`.

## Roadmap

| Stap | Pull request | Resultaat | Afhankelijk van |
| --- | --- | --- | --- |
| 0 | Minimale basis | Werkende demo, Google Sheets-basis en eenvoudige UI | afgerond in PR #4 |
| 1 | Datamodel en normalisatie | Eén betrouwbaar intern recordformaat voor alle gewenste kolommen | stap 0 |
| 2 | Toegang en privacy | Expliciete toegangscontrole en vaste browser-allowlist voor velden | stap 1 |
| 3 | Bronstatus en datakwaliteit | Twee Google-bronnen, gedeeltelijke uitval en duidelijke bronmeldingen | stap 2 |
| 4 | Volledige dropdownfilters | Tech-hub, schooljaar, regio, PO/VO, aanbieder, workshop, status, school en type | stap 3 |
| 5 | Datum- en bereikfilters | Datumkeuze, maandperiode en leerlingaantal met sliders | stap 4 |
| 6 | Kerncijfers en vergelijking | Oorspronkelijke KPI's en tech-hubs naast elkaar | stap 5 |
| 7 | Grafieken en leerjaren | Tijdlijn, verdelingen en gewogen PO/VO-leerjaren | stap 6 |
| 8 | Financieel overzicht | Kosten, facturatie, marge en volledigheidsmelding | stap 7 |
| 8.1 | Snapshotcache en laadtijd | Snelle servercache, handmatig verversen en veilige terugval | stap 8 |
| 9 | Vormgeving en productieafronding | Foundation-stijl, toegankelijkheid, responsive/print en productiedocumentatie | stap 8.1 |
| 9.1 | Donuts en gemeentekaart | Delen van het totaal en geografisch bereik inzichtelijk maken | stap 9 |
| 10 | Microsoft 365-bron | Microsoft Graph-adapter achter hetzelfde datacontract | stap 9.1 |

## Stap 1 · Datamodel en normalisatie

Doel: de volledige kolomstructuur betrouwbaar verwerken zonder de interface uit te breiden.

In deze PR:

- kolommen op koptekst vinden in plaats van op vaste positie;
- Nederlandse getallen, datums en lege waarden normaliseren;
- statuswaarden groeperen, bijvoorbeeld `Akkoord` en `Bevestiging` naar `Ingepland`;
- schooljaar uit de gekozen datum bepalen;
- combinatiegroepen en leerjaren verwerken;
- velden voor school, type en financiën intern voorbereiden;
- dubbele of ontbrekende aanvraag-ID's signaleren;
- uitgebreide unit-tests voor de aangeleverde kolomnamen.

Nog niet in deze PR: nieuwe filters, grafieken, Microsoft of financiële weergave.

Acceptatie:

- dezelfde rij geeft altijd hetzelfde genormaliseerde record, ongeacht kolomvolgorde;
- persoonsgegevens komen niet in `getDashboardData()` terecht;
- ongeldige waarden veroorzaken geen fout in de hele pagina;
- demo en één echte Google Sheet laden nog steeds.

## Stap 2 · Toegang en privacy

Doel: voordat school- en later financiële informatie zichtbaar wordt, is toegang expliciet geregeld.

In deze PR:

- het uitvoeringsmodel `USER_ACCESSING` behouden en documenteren;
- toegestane Google-accounts exact controleren;
- toegang zowel bij `doGet()` als `getDashboardData()` controleren;
- een ontbrekende identiteit standaard weigeren;
- één centrale lijst vastleggen van velden die naar de browser mogen;
- veilige, korte foutmeldingen zonder bron-ID's of providerdetails;
- tests voor toegestane, geweigerde en ontbrekende accounts.

Nog niet in deze PR: rollen, verschillende dashboards per tech-hub of financiële rechten.

Acceptatie:

- een niet-toegestaan account ontvangt geen dashboarddata;
- de demomodus omzeilt de toegangscontrole niet in een gepubliceerde web-app;
- de configuratie blijft op één duidelijke plek.

## Stap 3 · Bronstatus en datakwaliteit

Doel: twee Google Sheets betrouwbaar combineren zonder dat één bronfout het hele dashboard breekt.

In deze PR:

- beide Google-bronnen onafhankelijk uitlezen;
- per bron aantallen, waarschuwingen en laadstatus teruggeven;
- beschikbare brondata tonen als één bron faalt;
- rijlimieten en duidelijke foutmeldingen toevoegen;
- nooit automatisch terugvallen op demogegevens bij een live fout;
- een compacte sectie `Bronnen & datakwaliteit` toevoegen.

Acceptatie:

- bron A blijft zichtbaar wanneer bron B faalt;
- de gebruiker ziet dat het overzicht onvolledig is;
- providerfouten en spreadsheet-ID's verschijnen niet in de browser.

## Stap 4 · Volledige dropdownfilters

Doel: de belangrijkste selecties uit het oorspronkelijke ontwerp terugbrengen.

Filters:

- tech-hub;
- schooljaar;
- gemeente/regio;
- PO/VO;
- aanbieder;
- workshop;
- statusgroep;
- school;
- type.

Acceptatie:

- filters combineren met elkaar;
- `Filters wissen` herstelt de volledige selectie;
- opties worden uit de geladen data opgebouwd;
- aantallen, tabel en bestaande grafieken reageren direct;
- toetsenbordbediening blijft werken.

## Stap 5 · Datum- en bereikfilters

Doel: de twee schuifregelaars uit het oorspronkelijke ontwerp gecontroleerd terugbrengen.

In deze PR:

- kiezen tussen `Datum aanvraag` en `Definitieve datum`;
- maandbereik met een van/tot-slider;
- minimum en maximum aantal leerlingen;
- expliciete keuzes voor onbekende datum en onbekend leerlingaantal;
- leesbare tekstwaarden naast de sliders.

Acceptatie:

- onder- en bovengrens kunnen elkaar niet passeren;
- eindmaanden zijn inclusief;
- ontbrekende waarden worden alleen meegenomen wanneer dat is aangevinkt;
- mobiel en toetsenbord blijven bruikbaar.

## Stap 6 · Kerncijfers en vergelijking

Doel: de oorspronkelijke managementinformatie terugbrengen.

Kerncijfers:

- aanvragen/workshops;
- leerlingdeelnames;
- scholen;
- lesmomenten;
- uitgevoerd;
- gemiddeld aantal leerlingen per aanvraag;
- aanvragen per school.

Daarnaast komt de vergelijking tussen de twee tech-hubs terug.

Acceptatie:

- definities staan in `DATADEFINITIES.md`;
- scholen worden binnen tech-hub en regio eenduidig geteld;
- onbekende leerlingaantallen worden apart gemeld;
- alle cijfers volgen dezelfde actieve filters.

## Stap 7 · Grafieken en leerjaren

Doel: het visuele overzicht uit de eerste variant terugbrengen zonder externe grafiek-CDN.

Grafieken:

- workshops/leerlingen/lesmomenten per maand en tech-hub;
- PO/VO-verdeling;
- gemeenten/regio's;
- workshops;
- aanbieders;
- statusgroepen;
- gewogen leerjaren voor PO en VO.

Acceptatie:

- iedere grafiek heeft ook een leesbare tekst- of tabelweergave;
- lege selecties geven een nette lege staat;
- combinatiegroepen worden evenredig verdeeld;
- `prefers-reduced-motion` wordt gerespecteerd.

## Stap 8 · Financieel overzicht

Doel: financiële totalen pas toevoegen nadat toegang, definities en filtering stabiel zijn.

In deze PR:

- totale kosten aanbieder;
- te factureren bedrag;
- marge in euro;
- gewogen margepercentage;
- aantal volledige en onvolledige financiële regels;
- financieel blok standaard ingeklapt.

Acceptatie:

- marge wordt alleen berekend over regels met complete kosten én opbrengsten;
- totalen volgen alle filters;
- ontbrekende bedragen worden niet als nul geïnterpreteerd;
- de privacy- en toegangscontrole heeft aparte regressietests.

## Stap 8.1 · Snapshotcache en laadtijd

Doel: de Google Sheets niet bij iedere dashboardopening volledig opnieuw uitlezen.

In deze PR:

- een gedeelde, gecomprimeerde Apps Script-snapshot;
- uitsluitend browserveilige analysevelden in de snapshot;
- financiële velden bij ieder antwoord opnieuw op accountniveau afschermen;
- een handmatige knop die de bronnen bewust opnieuw inleest;
- een optionele tijdtrigger voor periodieke verversing;
- locking tegen gelijktijdige zware verversingen;
- automatische live terugval bij een ontbrekende of beschadigde snapshot;
- zichtbare herkomst, actualiteit en gemeten laadtijd in de interface.

Acceptatie:

- een tweede dashboardopening leest de Google Sheets niet opnieuw;
- handmatig vernieuwen vervangt de snapshot;
- een cachefout blokkeert het dashboard niet;
- een account zonder financiële toegang ontvangt ook vanuit de snapshot geen bedragen;
- persoonsgegevens en technische velden worden nooit gecachet.

## Stap 9 · Vormgeving en productieafronding

Doel: de functioneel stabiele Google-versie gereedmaken voor dagelijks gebruik en productie.

In deze PR:

- visuele afstemming op de 3Dindeklas Foundation;
- subtiele laad- en filteranimaties;
- responsive controle voor telefoon, tablet en desktop;
- toegankelijkheidscontrole;
- printweergave;
- definitieve installatie-, beheer- en updatehandleiding;
- oude of ongebruikte code verwijderen.

Acceptatie:

- geen functionele wijzigingen aan tellingen of databronnen;
- alle geautomatiseerde controles blijven groen;
- `/dev` en een nieuwe `/exec`-implementatie zijn handmatig gecontroleerd.

## Stap 9.1 · Donuts en gemeentekaart

Doel: grafiekvormen laten aansluiten bij de vraag die ze beantwoorden.

- donuts met aantallen en percentages voor PO/VO en statusgroepen;
- behoud van staven voor ranglijsten en leerjaren;
- een gemeentekaart op basis van openbare PDOK-grenzen, zonder externe dataverzoeken;
- een vaste werkgebieduitsnede en een landelijke weergave;
- inzicht in niet-gekoppelde regio’s en exacte aantallen in een tabel;
- behoud van dezelfde filters, snapshot en gegevensdefinities.

Dezelfde stap bevat de compacte indeling: filters als inklapbare zijbalk, bronstatus en laadgegevens onder **Data**, een **Weergave**-menu voor screenshots/afdrukken, één gemeentevak met Kaart/Ranglijst en één gezamenlijk PO/VO-leerjaarblok. De tech-hubvergelijking staat onderaan. Donutsegmenten hebben heldere kleuren en witte scheidingen.

Acceptatie: categorieaantallen blijven gelijk aan de tabellen, meerdere lesdagen verdubbelen geen kaartaanvraag en onbekende regio’s verdwijnen niet uit de telling.

## Stap 10 · Microsoft 365-bron

Doel: Microsoft aansluiten zodra de Graph-koppeling met een testaccount kan worden gecontroleerd.

In deze PR:

- Excel-tabel via Microsoft Graph uitlezen;
- OAuth-tokens uitsluitend server-side bewaren;
- tokenvernieuwing met locking;
- paginering van tabelrijen;
- Graph-data door exact dezelfde normalisatiefunctie sturen;
- Microsoft-bronstatus opnemen in de bestaande datakwaliteitssectie.

Acceptatie:

- de UI bevat geen Microsoft-specifieke logica;
- tokens, IDs en Graph-fouten verlaten de server niet;
- uitval van Microsoft blokkeert de Google-bron niet;
- demo en Google-only blijven zonder Microsoft-configuratie werken.

## Definition of done voor iedere PR

Een stap is pas klaar wanneer:

- de PR één roadmapstap behandelt;
- code en documentatie overeenkomen;
- demogegevens de nieuwe situatie afdekken;
- syntaxcontrole, tests en previewbuild slagen;
- geen geheimen of echte data in de diff staan;
- de Apps Script `/dev`-URL handmatig werkt;
- regressies in bestaande functies zijn uitgesloten;
- de PR door Mathijs is beoordeeld voordat hij wordt gemerged.
