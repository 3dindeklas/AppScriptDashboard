# Installatie van Workshopkompas

Gebruik bij voorkeur een **nieuw leeg Apps Script-project**. Zo blijven oude `.gs`-bestanden, foutcodes en verkeerd aangemaakte HTML-bestanden niet onzichtbaar meedraaien.

## Stap 1 · Maak de Apps Script-bestanden

Maak in Apps Script zeven scriptbestanden via **+ → Script**:

1. `Config`
2. `Code`
3. `Data`
4. `Cache`
5. `Auth`
6. `ExcelImport`
7. `Diagnostics`

Maak daarna zes HTML-bestanden via **+ → HTML**:

1. `Index`
2. `Styles`
3. `Municipalities`
4. `Client`
5. `Access`
6. `AccessClient`

Kopieer de inhoud uit de gelijknamige bestanden in `src/`.

Controleer de bestandstypen goed:

- `Config`, `Code`, `Data`, `Cache` en `Auth` krijgen in Apps Script de extensie `.gs`;
- `Index`, `Styles`, `Municipalities`, `Client`, `Access` en `AccessClient` krijgen de extensie `.html`;
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

Een Google-account in `financialAllowedEmails` moet ook in `allowedEmails` staan. Voor een gast met e-mailcode geldt de lijst `emailAccess.allowedEmails`; zie [TOEGANG.md](TOEGANG.md). Alleen in de financiële lijst staan geeft geen toegang tot de app. Een lege financiële lijst is toegestaan: het dashboard blijft dan werken, maar het financiële blok blijft voor iedereen verborgen en de bedragen worden niet naar de browser gestuurd.

Zet geen wachtwoorden, tokens, spreadsheet-ID's of andere geheimen in deze lijst.

## Stap 3 · Controleer de Apps Script-bestanden

Sla alle bestanden op en koppel bij stap 4 minimaal één Google Sheet. Open daarna **Implementeren → Implementaties testen → Web-app**. De `/dev`-URL gebruikt de laatst opgeslagen code en is alleen toegankelijk voor projecteditors. Test gasttoegang via de gepubliceerde `/exec`-URL.

De app heeft geen demomodus. Zonder ingestelde bron verschijnt een melding over de ontbrekende configuratie; er worden geen fictieve workshopgegevens geladen.

Bij een bestaand project: werk `Code.gs`, `Data.gs`, `Cache.gs` en `Client.html` samen bij. Verwijder de vervallen eigenschap `demoMode` uit je eigen `Config.gs` en behoud je broninstellingen en toegangsadressen. Voeg zo nodig **Auth** als script en **Access**, **AccessClient** en **Municipalities** als HTML toe. Zie [TOEGANG.md](TOEGANG.md) voor gastinzage.

## Stap 4 · Koppel één Google Sheet

Vul eerst alleen Tech-hub A in:

```javascript
const APP_CONFIG = Object.freeze({
  title: 'Workshopkompas',
  maxRowsPerSource: 5000,
  snapshotCache: Object.freeze({
    enabled: true,
    ttlSeconds: 21600
  }),
  allowedEmails: [
    'jouw.naam@organisatie.nl'
  ],
  financialAllowedEmails: [
    'jouw.naam@organisatie.nl'
  ],
  sources: [
    {
      name: 'Tech-hub A',
      spreadsheetId: 'PLAK_HIER_HET_SPREADSHEET_ID',
      sheetName: 'Workshops',
      headerRow: 8
    },
    {
      name: 'Tech-hub B',
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

Open **Filters** in de navigatie om de standaard ingeklapte zijbalk te tonen. De dropdownfilters worden automatisch opgebouwd uit de geladen workshopregels. Je kunt tech-hub, schooljaar, gemeente/regio, PO/VO, aanbieder, workshop, statusgroep, school en type combineren. **Filters wissen** herstelt de volledige gegevensselectie; de weergavekeuze blijft behouden.

Onder de dropdowns kun je kiezen tussen **Definitieve datum** en **Datum aanvraag**. Stel daarna met de twee maandsliders een inclusieve periode in. `Definitieve datum` mag meerdere lesdagen bevatten, gescheiden door komma’s, puntkomma’s of nieuwe regels. Een workshop wordt opgenomen zodra minimaal één van die lesdagen binnen de gekozen periode valt; de tabel toont alle lesdagen. De leerling-sliders gebruiken automatisch het laagste en hoogste bekende aantal. De twee vinkjes bepalen expliciet of workshopregels zonder geldige datum of zonder leerlingaantal zichtbaar blijven. De sliders reageren direct, zijn met de pijltjestoetsen te bedienen en kunnen elkaar niet passeren.

Controleer de kerncijfers tegen je bronblad en kies daarna een tech-hub of periode. Alle cijfers en grafieken moeten dezelfde selectie volgen. Wissel de maandgrafiek tussen aanvragen, leerlingdeelnames en lesmomenten. Open de tabelweergaven en vergelijk de waarden met de grafieken.

Open als financieel toegestaan account **Kosten, facturatie en marge**. Dit blok begint ingeklapt. Controleer de totalen tegen het bronblad en test ook een account zonder financiële toegang: het blok en de financiële velden horen dan te ontbreken.

De kosten- en facturatietotalen tellen ieder hun bekende bedragen. Marge wordt alleen berekend voor regels waarop beide bedragen aanwezig zijn. Controleer dit ook met één lege kostencel en één lege factuurcel: de lege cel mag niet als € 0,00 worden behandeld en de betreffende regel moet als onvolledig worden geteld.

Kies vervolgens één tech-hub en verklein het maand- en leerlingbereik. Alle grafieken en tabellen moeten direct dezelfde selectie volgen. Maak ook bewust een lege combinatie van filters; ieder onderdeel hoort dan een duidelijke lege melding te tonen in plaats van een JavaScript-fout.

Open **Data → Bronnen & datakwaliteit** om per tech-hub te zien of de bron geladen is, hoeveel workshopregels zijn ingelezen en welke vaste controles aandacht vragen. De standaardlimiet is 5.000 workshopregels per bron. Verhoog deze alleen bewust; de code hanteert altijd een harde bovengrens van 10.000 regels per bron.

Formules mogen onder de echte gegevens alvast zijn doorgetrokken. Rijen die uitsluitend formules bevatten worden niet geladen, tellen niet als workshop en verbruiken de rijlimiet niet. Test dit desgewenst door een formule enkele honderden rijen naar beneden door te trekken: het getoonde aantal workshops hoort gelijk te blijven. Een echte workshoprij met daarnaast berekende formulevelden blijft wel gewoon zichtbaar.

Tijdens het ophalen blijft bovenaan een laadmelding met spinner zichtbaar. Na 1,5, 5 en 10 seconden verandert de tekst, zodat zichtbaar blijft dat de pagina nog op Apps Script en de Sheets wacht. Dit is geen geschat percentage. Na een succesvolle laadactie toont de pagina een korte **Bijgewerkt**-regel. Onder **Data** staan het volledige bijwerktijdstip, de herkomst (**Google Sheets** of **Snapshot**) en de gemeten laadtijd afzonderlijk. De knop **Brongegevens vernieuwen** staat ook onder Data en is tijdens het laden uitgeschakeld.

Met **Weergave** zet je onderdelen afzonderlijk aan of uit voor een screenshot of afdruk. Gemeenten zijn één blok met de keuze **Kaart/Ranglijst** en PO- en VO-leerjaren staan in één gezamenlijk blok. De tech-hubvergelijking staat onderaan. Zie [Compact dashboard en screenshots](WEERGAVE.md).

De bronimport leest per Sheet eerst de kopregel, daarna één compact ankerbereik en ten slotte één keer de benodigde brede tabel. Test bij voorkeur ook met de grootste echte Sheet en met ver doorgetrokken formules. Blijft de melding langer dan 10 seconden staan, controleer dan in Apps Script onder **Uitvoeringen** of het wachten in de bronimport zit en noteer de getoonde laadtijd na afloop.

## Stap 4a · Gebruik de snelle snapshot

In live-modus probeert het dashboard eerst de gedeelde Apps Script-snapshot. De eerste aanvraag zonder geldige snapshot leest beide Google Sheets en slaat daarna een gecomprimeerde, privacyveilige kopie op. Volgende aanvragen gebruiken die kopie en hoeven de bronbladen niet opnieuw te scannen.

De standaardinstelling is:

```javascript
snapshotCache: Object.freeze({
  enabled: true,
  ttlSeconds: 21600
}),
```

`ttlSeconds` mag maximaal `21600` zijn: zes uur. Google kan een cache-item eerder verwijderen. Dat is geen fout; de eerstvolgende aanvraag leest dan automatisch opnieuw de Sheets en bouwt een nieuwe snapshot. Een onvolledig eerste resultaat, bijvoorbeeld doordat één bron tijdelijk uitvalt, wordt hooguit vijf minuten bewaard zodat herstel snel opnieuw wordt geprobeerd. Bestond al een complete snapshot, dan wordt die niet door een mislukte verversing overschreven. Zet `enabled` alleen tijdelijk op `false` wanneer je de cache bij een diagnose volledig wilt uitschakelen.

De knop **Brongegevens vernieuwen** omzeilt de bestaande snapshot, leest beide Sheets opnieuw en vervangt de snapshot. Een gewone herlaadactie gebruikt juist de bestaande snapshot. Test dit als volgt:

1. open de live app en controleer onder **Data** de herkomst `Google Sheets`;
2. herlaad de pagina en controleer dat de herkomst `Snapshot` wordt getoond;
3. wijzig een herkenbare testwaarde in een bronblad;
4. herlaad normaal en controleer dat de snapshot nog wordt gebruikt;
5. kies **Brongegevens vernieuwen** en controleer dat de nieuwe waarde verschijnt;
6. open de app met een account zonder financiële toegang en controleer dat financiële velden ook vanuit de snapshot ontbreken.

De snapshot bevat nooit contactpersonen, e-mailadressen, telefoonnummers, notities of technische ID's. De twee financiële basisbedragen worden alleen na controle van `financialAllowedEmails` aan het browserantwoord toegevoegd.

### Optioneel ieder uur automatisch vernieuwen

Wil je de snapshot ook zonder geopende browser actueel houden, maak dan één tijdtrigger aan:

2. open links in Apps Script **Triggers**;
3. kies **Trigger toevoegen**;
4. selecteer de functie `refreshDashboardSnapshot`;
5. kies als gebeurtenisbron **Tijdgestuurd**;
6. kies **Uurtimer** en bijvoorbeeld **Elk uur**;
7. sla de trigger op en geef toestemming wanneer Google daarom vraagt.

De trigger draait met het Google-account van de maker. Dit account moet in `allowedEmails` staan en toegang hebben tot beide bronbladen. Maak maar één trigger aan; meerdere identieke triggers leveren alleen onnodige Sheet-reads op.

## Stap 5 · Koppel de tweede Google Sheet

Vul pas wanneer Tech-hub A werkt ook het `spreadsheetId` van Tech-hub B in. Beide sheets gebruiken dezelfde kopteksten en dezelfde kopregelinstelling.

Als één bron niet bereikbaar is, blijven de gegevens van de andere bron zichtbaar. Het dashboard meldt dan dat het overzicht onvolledig is. Er worden nooit fictieve gegevens als vervanging geladen.

## Stap 6 · Publiceer een versie

Wanneer de `/dev`-test werkt:

1. kies **Implementeren → Nieuwe implementatie**;
2. kies **Web-app**;
3. voer de app met het huidige gastmanifest uit als **ik (de beheerder)**;
4. kies **iedereen**, zodat ook bezoekers zonder Google-account de toegangspagina bereiken;
5. controleer dat de beheerder de Google Sheets kan lezen en configureer de toegestane gastadressen;
6. open de nieuwe `/exec`-URL.

Het huidige manifest gebruikt `executeAs: USER_DEPLOYING`. De beheerder verleent de Sheet- en mailrechten; bezoekers verifiëren hun toegestane adres met een code. Volg [TOEGANG.md](TOEGANG.md) voor autoriseren en de gastacceptatietest. De allowlists blijven verplicht.

Een bestaande Google-installatie mag `USER_ACCESSING` met toegang voor aangemelde gebruikers blijven gebruiken. In dat model verleent iedere gebruiker zelf toestemming en moeten de bronbladen voor die gebruiker toegankelijk zijn. `npm run check` ondersteunt beide modellen en controleert de bijbehorende toegangsinstellingen en scopes.

Na latere codewijzigingen moet je de bestaande implementatie bewerken en een nieuwe versie selecteren. Alleen opslaan vernieuwt de gepubliceerde `/exec`-versie niet.

Gebruik bij iedere productiepublicatie ook de volledige [productie- en beheerchecklist](PRODUCTIE.md). Die bevat de handmatige tests voor responsive gedrag, toetsenbordbediening, financiële afscherming, snapshotverversing, afdrukken en rollback.

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

Een ontbrekende, verlopen of onvolledige snapshot krijgt geen aparte foutcode: de app valt dan automatisch terug op de live Google Sheets. Cacheproblemen zijn alleen als `[snapshot-cache:...]` in de afgeschermde serverlog herkenbaar.

## Excel uit Microsoft importeren

Volg [EXCEL_IMPORT.md](EXCEL_IMPORT.md). De app importeert een downloadbaar Excel-bestand of een in Drive geplaatste Excel-export naar een eigen Google-tabblad. De dashboardpagina downloadt nooit zelf Microsoft-data. Een bron die Microsoft-aanmelding vereist blijft zonder Microsoft-koppeling niet automatisch bereikbaar.

Voeg ExcelImport.gs toe, werk Data.gs en Cache.gs samen bij en neem de aanvullende scopes en Advanced Drive v3 uit het manifest over. Behoud je bestaande toegangsadressen en broninstellingen. De beheerder autoriseert de Google-rechten opnieuw. Controleer de nieuwe Apps Script-publicatie na merge; zie STATUS.md voor de nog openstaande praktijkacceptatie.

Voor het controleren van scopes, services en bronrechten en het starten van de import: zie [DIAGNOSE.md](DIAGNOSE.md). Gebruik in de editor eerst authorizeApp, daarna checkAppSetup en vervolgens refreshExcelImports.
