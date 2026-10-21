# Gemeentekaart en donuts

De gemeentekaart laat zien waar de aanvragen in de huidige filterselectie vandaan komen. PO/VO en statusgroepen gebruiken een donut omdat deze categorieën samen één totaal vormen. Voor ranglijsten van workshops, aanbieders en regio’s blijven de horizontale staven staan.

## Gebruik

- De kaart en de regionale staafgrafiek staan gelijktijdig in één gemeentevak. De ranglijst staat onder de werkgebiedtoelichting; de kaart groeit op desktop mee met de hoogte van die kolom. Op een klein scherm staan beide onder elkaar.
- **Werkgebied** zoomt in op de gemeenten die in alle geladen gegevens herkend worden. De uitsnede blijft gelijk wanneer je filters aanpast.
- **Heel Nederland** toont de volledige gemeentekaart.
- Lichtpaars staat voor weinig aanvragen; donkerpaars voor het hoogste aantal in de huidige selectie. De legenda benoemt het actuele maximum.
- Grijs betekent nul gekoppelde aanvragen in de huidige selectie.
- De kaart toont aantallen bij maximaal twaalf gemeenten met de meeste aanvragen; overlappende labels worden weggelaten. Alle aantallen blijven beschikbaar via de keuzelijst en de tabel.
- Klik of tik op een gemeente, of gebruik **Gemeente bekijken**, om het exacte aantal te zien. Dit bekijkt alleen details en verandert geen filter.
- Open **Bekijk alle gemeenteaantallen als tabel** voor alle gekoppelde én niet-gekoppelde waarden.

De kaart is een overzicht met absolute aantallen, geen ranglijst gecorrigeerd voor inwoneraantal of aantal scholen. Een geografisch grote gemeente kan daardoor visueel veel ruimte innemen zonder het hoogste aantal te hebben. De staven in hetzelfde blok geven een precieze vergelijking. Bronvermelding en licentie staan onder **Data → Kaartbronnen en licentie**.

## Gemeentekoppeling

Gebruik in `Gemeente / Regio` bij voorkeur de officiële gemeentenaam, bijvoorbeeld `Gorinchem`, `Molenlanden`, `Altena` of `Vijfheerenlanden`. Een officiële gemeentecode zoals `GM0512` werkt ook.

Het vergelijken negeert hoofdletters, accenten, leestekens en het voorvoegsel `Gemeente `. Daardoor koppelen `Gemeente Gorinchem` en `GORINCHEM` aan dezelfde gemeente en tellen ze samen op de kaart. De bestaande dropdownfilter blijft de oorspronkelijke celwaarden gebruiken.

De app raadt geen gemeente bij een dorpsnaam of afkorting. `Ameide`, `VHL`, een brede regio of een spelfout blijft dus **Niet gekoppeld** totdat de bronwaarde is aangepast. Zulke aanvragen blijven gewoon zichtbaar in andere grafieken en tellen mee in de totalen. Het kaartblok meldt hoeveel aanvragen gekoppeld zijn; de tabel toont alle overige waarden.

Na het aanpassen van een bronwaarde kies je **Brongegevens vernieuwen**, zodat ook de snapshot wordt bijgewerkt.

## Openbare kaartasset

`src/Municipalities.html` bevat uitsluitend openbare gemeentegrenzen, namen en gemeentecodes. Het bestand bevat geen workshops, scholen of andere brongegevens.

- Bron: Kadaster / PDOK, [Bestuurlijke Gebieden – gemeentegebied](https://api.pdok.nl/kadaster/brk-bestuurlijke-gebieden/ogc/v1/collections/gemeentegebied).
- Licentie: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.nl).
- Opgehaald: 20 oktober 2026, 342 gemeenten.
- Projectie: RD New / EPSG:28992. De SVG gebruikt 500 meter per coördinaateenheid, met de verticale as omgekeerd voor schermweergave.
- Bewerking: contouren vereenvoudigd met een tolerantie van 75 meter; labelpunten berekend binnen de grootste gemeentepolygoon.
- Doel: snelle overzichtskaart; niet gebruiken voor juridische of kadastrale grensbepaling.

De asset wordt samen met de pagina geladen. Kaartinteractie en filteren gebruiken geen kaartserver, tegeldienst, geocoder, API-sleutel of extern grafiekpakket. Workshopgegevens verlaten de Apps Script-app niet voor het tekenen van de kaart.

## Grenzen bijwerken

Werk de openbare asset in een aparte, controleerbare wijziging bij wanneer de gemeentelijke indeling verandert. Download de volledige collectie in EPSG:28992:

```sh
curl --fail --location --output /tmp/workshopkompas-gemeenten.geojson 'https://api.pdok.nl/kadaster/brk-bestuurlijke-gebieden/ogc/v1/collections/gemeentegebied/items?f=json&limit=1000&crs=http://www.opengis.net/def/crs/EPSG/0/28992'
node scripts/build-municipalities.cjs /tmp/workshopkompas-gemeenten.geojson
npm run check
npm test
npm run preview:build
```

Controleer gemeentecodes, datum, gewijzigde namen, kaartuitsnede en labels. Pas de documentatie, bronvermelding in `Index.html` en de controle op het verwachte gemeenteaantal in de tests aan als de indeling is gewijzigd. Kopieer daarna de gegenereerde inhoud naar het Apps Script-HTML-bestand **Municipalities**.

## Acceptatietest

1. Open de demo: 10 aanvragen horen aan 7 gemeenten gekoppeld te zijn.
2. Controleer de PO/VO-donut: PO 8 / 80,0%, VO 2 / 20,0%.
3. Controleer de statusdonut: Ingepland 4 / 40,0%, Uitgevoerd 4 / 40,0%, Open 2 / 20,0%.
4. Filter op een tech-hub of periode: donuts, kaart en bestaande cijfers moeten dezelfde selectie tonen.
5. Bekijk een gemeente via klik/tik en via de keuzelijst. Beide moeten hetzelfde aantal tonen.
6. Wissel tussen werkgebied en landelijke weergave; wis vervolgens de filters.
7. Test een onbekende regio: de aanvraag blijft meetellen en verschijnt als niet gekoppeld.
8. Test een lege selectie: nul gekoppelde aanvragen, grijze gemeenten en een duidelijke lege tabelmelding.
9. Controleer de kaart op telefoon/tablet en in **Afdrukken / PDF**.
