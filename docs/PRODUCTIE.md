# Productie- en beheerhandleiding

Deze checklist hoort bij stap 9. Gebruik hem voor de eerste productiepublicatie en na iedere wijziging aan code, configuratie of databronnen.

## Verantwoordelijkheden

Wijs minimaal deze rollen toe:

- één functioneel beheerder die filters, tellingen en bronstatus controleert;
- één Apps Script-beheerder die implementaties, uitvoeringen en triggers beheert;
- één eigenaar per bronblad die de kolomstructuur en deelrechten bewaakt.

Leg buiten GitHub vast wie deze rollen heeft. Sla geen accounts, spreadsheet-ID's of productiedata in de repository op.

## Voor iedere publicatie

1. Werk vanaf de nieuwste `main` en controleer dat de vorige pull request is gemerged.
2. Voer lokaal uit:

   ```sh
   npm run check
   npm test
   npm run preview:build
   ```

3. Controleer de fictieve preview op telefoon-, tablet- en desktopbreedte.
4. Kopieer alle gewijzigde bestanden uit `src/` naar het Apps Script-project.
5. Controleer in `Config.gs`:
   - `demoMode` staat in productie op `false`;
   - alleen volledige, bedoelde adressen staan in `allowedEmails`;
   - financiële kijkers staan óók in `allowedEmails`;
   - iedere Google-bron heeft de juiste spreadsheet-ID, tabbladnaam en kopregel;
   - `snapshotCache.ttlSeconds` is maximaal 21.600 seconden.
6. Sla alles op en test eerst de `/dev`-URL.

## Handmatige acceptatietest op `/dev`

Test met een toegestaan account:

- de pagina toont de paarse 3Dindeklas-header en laadt zonder consolefout;
- een eerste live laadactie benoemt Google Sheets; een volgende laadactie benoemt de snelle snapshot;
- **Brongegevens vernieuwen** leest de bron opnieuw en herstelt daarna de knop;
- beide bronnen tonen een begrijpelijke status en het verwachte aantal regels;
- filters, datumsliders, leerlingensliders en **Filters wissen** werken samen;
- meerdere definitieve lesdatums blijven zichtbaar en filterbaar;
- KPI's, vergelijking, grafieken en recente workshops reageren op dezelfde filters;
- een lege filtercombinatie geeft lege meldingen en geen JavaScript-fout;
- het financiële blok is alleen zichtbaar voor een financieel toegestaan account;
- **Afdrukken / PDF** geeft een rustige A4-landscapeweergave zonder filters en knoppen;
- toetsenbordfocus is zichtbaar en alle bediening is zonder muis bereikbaar;
- de pagina blijft bruikbaar rond 375 px, 768 px en 1280 px breed.

Herhaal de toegangscontrole met:

- een toegestaan account zonder financieel recht;
- een niet-toegestaan account;
- indien mogelijk één account dat wel dashboardtoegang maar geen Sheet-toegang heeft.

## Publiceren op `/exec`

1. Open **Implementeren → Implementaties beheren**.
2. Bewerk de bestaande web-appimplementatie.
3. Kies **Nieuwe versie** en noteer kort welke pull request wordt gepubliceerd.
4. Behoud **Uitvoeren als gebruiker die de web-app opent**.
5. Behoud de bedoelde Google Workspace-doelgroep; maak de app niet publiek.
6. Publiceer en open de `/exec`-URL in een nieuw venster.
7. Herhaal minimaal laden, één filter, handmatig vernieuwen, financiële afscherming en afdrukweergave.

Alleen code opslaan vernieuwt de `/exec`-versie niet.

## Snapshot en geplande verversing

De snapshot is een tijdelijke, gedeelde Apps Script-cache. Een cache-miss is normaal: de app leest dan opnieuw de Google Sheets. Gebruik maximaal één tijdgestuurde trigger voor `refreshDashboardSnapshot`.

Controleer bij een trigger:

- de maker staat in `allowedEmails`;
- de maker heeft toegang tot alle bronbladen;
- er bestaat niet al een identieke trigger;
- mislukte uitvoeringen zijn zichtbaar bij **Uitvoeringen** in Apps Script.

De knop **Brongegevens vernieuwen** is de juiste handmatige actie na een wijziging in een bronblad.

## Storingen onderzoeken

1. Noteer tijdstip, zichtbare foutcode, foutreferentie en gebruikte `/dev`- of `/exec`-URL.
2. Open Apps Script **Uitvoeringen** en zoek dezelfde uitvoering.
3. Controleer eerst accounttoegang, Sheet-deelrechten, tabbladnaam en kopregel.
4. Controleer daarna of alle zeven Apps Script-bestanden uit dezelfde commit komen.
5. Deel geen volledige logregels wanneer die broninformatie of IDs bevatten.

Een fout in één bron hoort de andere bron niet te blokkeren. Een cacheprobleem hoort automatisch terug te vallen op live Sheet-data.

## Terugrollen

Gebruik bij een productieprobleem de vorige werkende Apps Script-versie:

1. open **Implementeren → Implementaties beheren**;
2. bewerk de web-appimplementatie;
3. selecteer de laatst bekende werkende versie;
4. publiceer en controleer de `/exec`-URL;
5. leg de fout vast in een aparte branch of issue voordat een nieuwe fix wordt gemaakt.

Verwijder geen brondata en wijzig geen Sheet-kolommen als rollbackmaatregel.

## Periodiek beheer

Controleer maandelijks:

- of de accountlijsten nog actueel zijn;
- of beide bronbladen nog dezelfde kopteksten gebruiken;
- of de tijdtrigger zonder fouten draait;
- of laadtijd, bronstatus en datakwaliteitswaarschuwingen opvallend veranderen;
- of de actieve `/exec`-versie overeenkomt met de bedoelde release;
- of de officiële Foundation-stijl of het logo is bijgewerkt.

Microsoft 365 valt buiten stap 9. Die koppeling wordt als afzonderlijke stap 10 toegevoegd zodra een testaccount beschikbaar is.
