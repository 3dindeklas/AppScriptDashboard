# Installatie in Google Apps Script

## 1. Project aanmaken

1. Maak een zelfstandig Apps Script-project in het Google-account dat dit dashboard beheert.
2. Maak scriptbestanden aan met de namen uit `src/*.gs`; kopieer de inhoud. Maak HTML-bestanden `Index`, `Styles`, `Analytics` en `Client` aan en kopieer de overeenkomstige bestanden.
3. Zet in Projectinstellingen de optie aan om `appsscript.json` te tonen. Vervang de inhoud door `src/appsscript.json`.
4. Het manifest heet **appsscript.json** (met drie s’en na `app`), niet `appscript.json`. Algemene instellingen staan in `Config.gs`, geen ongekende velden in het manifest.

Optioneel met clasp: installeer de officiële `@google/clasp`-CLI en voer `clasp login` uit. Maak uitsluitend lokaal `.clasp.json`:

```json
{"scriptId":"JOUW_SCRIPT_ID","rootDir":"src"}
```

Voer `clasp push` uit, inspecteer de bestanden in de editor en maak daarna handmatig een deployment. `.clasp.json` en loginbestanden worden niet gecommit. De `.claspignore` laat alleen Apps Script-bronbestanden toe. Geen automatische productie-deployment vanuit GitHub.

## 2. Wie mag het dashboard zien?

Ga naar **Projectinstellingen → Script properties** en voeg toe:

| Naam | Waarde |
| --- | --- |
| `DASHBOARD_ALLOWED_EMAILS` | Exacte Google-e-mailadressen, gescheiden door komma’s, bijvoorbeeld `beheerder@example.org,collega@example.org` |
| `DASHBOARD_ADMIN_EMAILS` | Beheerders die Microsoft mogen koppelen; moeten ook in de bovenstaande lijst staan |
| `DEMO_MODE` | Eerst `true`; na bronconfiguratie exact `false` |

Gebruik geen wildcard of domein in de allowlist: de vergelijking is op het volledige adres. Spaties en hoofdletters worden genormaliseerd. Een lege lijst blokkeert iedereen. Google moet een geautoriseerde identiteit leveren; de app weigert lege identiteiten.

**Alle allowlistgebruikers zien beide stichtingen en de financiën.** Voor een beperktere doelgroep is een aparte deployment/projectconfiguratie nodig; een dropdown is geen toegangsbeperking. Geef gewone dashboardgebruikers géén bewerkrechten op het Apps Script-project.

## 3. Google Sheets aansluiten

De echte instellingen kunnen geheel in Script Properties blijven. Voeg `DASHBOARD_SOURCES` toe met een JSON-array:

```json
[
  {
    "id": "stichting-a",
    "label": "Naam stichting A",
    "type": "googleSheets",
    "enabled": true,
    "spreadsheetId": "VUL_SHEET_ID_IN",
    "sheetName": "Workshops",
    "headerRow": 8
  },
  {
    "id": "stichting-b",
    "label": "Naam stichting B",
    "type": "microsoftExcel",
    "enabled": false,
    "driveId": "VUL_DRIVE_ID_IN",
    "itemId": "VUL_EXCEL_ITEM_ID_IN",
    "tableName": "Workshops",
    "connectionId": "M365_B"
  }
]
```

`spreadsheetId` staat tussen `/d/` en `/edit` in de Sheets-URL. `sheetName` moet exact de tabbladnaam zijn. `headerRow: 8` betekent: kolomkoppen op rij 8, gegevens vanaf rij 9. Gebruik `1` als de koppen bovenaan staan. Lege tussenkolommen zijn toegestaan. De kolomvolgorde mag verschillen; er wordt op koptekst gemapt. Namen worden getrimd en hoofdletterongevoelig vergeleken.

Zowel bron A als bron B kan `googleSheets` gebruiken. Je kunt meerdere bronnen/tabbladen toevoegen; iedere bron heeft een unieke `id`. Gebruik hetzelfde label voor tabbladen van één stichting alleen als je ze toch apart wilt vergelijken: **de bron-ID is de vergelijkings-/filtereenheid in deze versie**, er is nog geen afzonderlijke stichting-tabbladhiërarchie.

Deel ieder Google-bronbestand met iedere dashboardbezoeker, minimaal als lezer. Omdat het script als bezoeker uitvoert, kan de ene bezoeker anders minder bronnen laden dan de andere. Voor bezoekers die de ruwe Google-bron niet mogen lezen, is een andere serverarchitectuur nodig; verander niet zomaar naar “uitvoeren als mij”.

De sheet bevat één regel per aanvraag, geen subtotalen tussen de data. De verplichte kolommen zijn `Aanvraag ID`, `Datum aanvraag`, `Schoolnaam`, `Workshopnaam`, `Aantal leerlingen` en `Status`. Zie de datadefinities voor de overige velden.

## 4. Excel in Microsoft 365 aansluiten

Dit is een directe serverkoppeling naar een `.xlsx`-werkmap in OneDrive for Business of SharePoint. Er hoeft geen openbare deel-link of CSV gepubliceerd te worden.

### Eenmalige inrichting in Microsoft Entra

1. Laat een Microsoft-beheerder een eigen **single-tenant app registration** aanmaken voor Workshopkompas.
2. Noteer **Application (client) ID** en **Directory (tenant) ID**. Gebruik GUID’s, niet de displaynaam.
3. Zet bij Authentication de instelling **Allow public client flows** aan. Deze implementatie gebruikt device-code-aanmelding en heeft geen client secret of redirect URI nodig.
4. Voeg Microsoft Graph **delegated** permission `Files.ReadWrite` toe en verleen de toestemming die het tenantbeleid vereist. `offline_access` wordt bij aanmelding aangevraagd.
5. Gebruik een organisatieaccount dat toegang heeft tot de bedoelde werkmap. Beperk de bestandstoegang van dat account tot wat voor deze rapportage nodig is.

**Waarom ReadWrite?** Microsoft vereist dit delegated scope ook voor het lezen van Excel-tabelrijen. De Excel workbook-API ondersteunt hier geen application-permissions. Deze code doet uitsluitend GET-verzoeken op de workbook-data; de toegekende Microsoft-bevoegdheid zelf is breder. Laat dit vooraf door de Microsoft-beheerder beoordelen. Als het beleid device code of deze scope blokkeert, gebruik dan voorlopig een afgeschermde Google Sheet als tweede bron; een app-only/client-credentials-token werkt niet voor deze adapter.

### Werkmap en eigenschappen

1. Zet de gegevens in Excel om naar een **benoemde tabel** (Invoegen → Tabel) en noem deze bijvoorbeeld `Workshops`. Neem alleen de echte kopregel en gegevens op, niet de titelrijen erboven. Excel geeft lege spacer-koppen automatisch namen; die worden genegeerd.
2. Gebruik echte datumcellen of één datum in `dd-mm-jjjj`, `dd/mm/jjjj` of `jjjj-mm-dd`. Meerdere datums in één cel worden niet als één datum geraden.
3. Zoek met een geautoriseerde Microsoft-beheerder de `driveId` en `itemId` op. In Graph Explorer kun je bijvoorbeeld `GET /v1.0/me/drive` gebruiken voor de eigen OneDrive en `GET /v1.0/drives/{drive-id}/root:/pad/naar/bestand.xlsx` voor het bestand. Voor SharePoint: bepaal eerst de site, dan `GET /v1.0/sites/{site-id}/drives`, en kies de juiste documentbibliotheek.
4. Zet in Script Properties `M365_B_TENANT_ID` en `M365_B_CLIENT_ID`. Plaats `driveId`, `itemId`, `tableName` en `connectionId: "M365_B"` in `DASHBOARD_SOURCES` en zet deze bron op `enabled: true`.
5. Controleer dat `CONFIG.microsoftSetupSourceId` naar die bron-ID wijst (standaard `stichting-b`). Voor een tweede Microsoft-account kun je een andere connectionId gebruiken en de setupSourceId tijdelijk naar de bijbehorende bron wijzigen.

### Aanmelden vanuit de Apps Script-editor

1. Open de editor als een beheerder uit beide e-maillijsten.
2. Voer `startMicrosoftConnection_` uit en autoriseer de Google-scopes indien gevraagd.
3. Open zelf de Microsoft-verificatiepagina uit het uitvoeringslog en voer de getoonde tijdelijke gebruikerscode in. Meld aan met het bedoelde Microsoft-organisatieaccount en controleer de appnaam en toestemming.
4. Voer na het afronden `finishMicrosoftConnection_` uit. Bij “Aanmelding nog niet afgerond” wacht je minimaal vijf seconden en probeer je opnieuw. Na verlopen van de tijdelijke code begin je opnieuw bij stap 2.
5. De refresh token wordt automatisch opgeslagen als `M365_B_REFRESH_TOKEN`. Kopieer deze niet naar bestanden, logs of GitHub. De tijdelijke device-code wordt na succes verwijderd.
6. De app vernieuwt access tokens server-side en bewaart nieuwe refresh tokens. De kortlevende access token staat maximaal 55 minuten in de Script Cache. Een scriptlock voorkomt gelijktijdige tokenrotaties.

Bij intrekking van consent, verlopen credentials of gewijzigd tenantbeleid kan opnieuw aanmelden nodig zijn. `disconnectMicrosoft_` wist de lokale koppeling; trek daarnaast de toestemming bij Microsoft in als je de autorisatie volledig wilt beëindigen. Verander bij een andere tenant/client eerst de koppeling en koppel opnieuw.

## 5. Web-app implementeren

1. Kies **Implementeren → Nieuwe implementatie → Web-app**.
2. Stel **Uitvoeren als: gebruiker die de web-app opent** in. Het manifest noemt dit `USER_ACCESSING`.
3. Kies toegang voor gebruikers met een Google-account (of binnen je organisatie als dat voldoende is). In het manifest betekent `ANYONE` aangemelde gebruikers; er staat uitdrukkelijk géén `ANYONE_ANONYMOUS`.
4. Implementeer en open de `/exec`-URL. Iedere bezoeker autoriseert de benodigde Google-scopes. Organisatiebeleid en OAuth-verificatie kunnen externe gebruikers beperken; test met een account van beide stichtingen.
5. Test eerst met `DEMO_MODE=true`, daarna `false`. “DEMO · fictieve gegevens” moet bij live gebruik verdwijnen.
6. Controleer dat alle bronnen geladen zijn en vergelijk totalen handmatig met een kleine selectie in de oorspronkelijke bestanden.
7. Test met een account buiten de allowlist: dat mag de pagina en de data-RPC niet gebruiken.
8. Werk bij volgende codewijzigingen de bestaande deployment bij naar een nieuwe versie. Een `clasp push` alleen wijzigt de gepubliceerde `/exec`-versie niet.

Er is geen automatische verversing: de eerste opening en **Vernieuwen** halen opnieuw op. Filters rekenen vervolgens direct in het browsergeheugen. Vernieuwen stelt de selectiefilters opnieuw in. Bij verversfouten worden oude gegevens verwijderd; bij een bronfout staat nadrukkelijk dat de rapportage onvolledig is.

## JSON-fout of onterechte melding “Geen toegang”

De oude `doGet()` ving zowel toegangs- als HTML-opstartfouten op met dezelfde melding “Geen toegang”. De bijgewerkte versie maakt onderscheid tussen de accountcontrole, configuratie en het opbouwen van de pagina. Configuratie wordt na de toegangscontrole gecontroleerd, ook bij het opnieuw ophalen van data. Een ongeldige configuratie schakelt nooit stilzwijgend terug naar demo.

`Expected property name or '}' in JSON ...` wijst op ongeldige JSON, vaak een veldnaam zonder dubbele aanhalingstekens, enkele/slimme aanhalingstekens of een comment. De positie alleen vertelt niet welk bestand of welke property de oorzaak is. In de oorspronkelijke code parseert `doGet()` zelf geen JSON; `DASHBOARD_SOURCES` wordt pas bij de data-RPC gelezen. Bij een fout tijdens opslaan of vóór het uitvoeren van functies moet je ook `appsscript.json` controleren. Een kapot manifest kan de runtime blokkeren voordat onze foutafhandeling draait.

Controleer **Projectinstellingen → Script properties → DASHBOARD_SOURCES**:

- Plak alleen een JSON-array zoals in [sources.example.json](sources.example.json), met de eigen broninstellingen ingevuld.
- Gebruik `"id": "stichting-a"`, niet `id: 'stichting-a'`.
- Gebruik geen `const CONFIG =`, `sources:`, Markdown-codehekken, comments of komma na het laatste veld.
- `enabled` is een JSON-boolean: `true` of `false`, niet `"true"` of `"false"`.
- Wil je alles in `Config.gs` beheren? **Verwijder** dan de property `DASHBOARD_SOURCES`; een aanwezige property overschrijft `CONFIG.sources`. Laat geen lege waarde of `[]` staan. Controleer eerst dat de bronnen in `Config.gs` correct zijn ingesteld.
- `DEMO_MODE` is een losse tekstproperty met `true` of `false`, zonder extra aanhalingstekens. Dit is dus geen JSON-object.

| Foutcode | Betekenis / oplossing |
| --- | --- |
| `ACCESS_DENIED` | Google-account ontbreekt of staat niet in de allowlist. |
| `ACCESS_CHECK_FAILED` | De accountcontrole zelf faalde; controleer Google-autorisatie en uitvoeringsidentiteit. |
| `CONFIG_SOURCES_JSON` | De waarde van `DASHBOARD_SOURCES` is geen geldige JSON. |
| `CONFIG_SOURCES_SHAPE` | De bronnen moeten een niet-lege array zijn, geen los object, `null` of tekst. |
| `CONFIG_SOURCES_ENTRY` | Controleer per bron de id, het label, dubbele id’s en het type van enabled. |
| `CONFIG_SOURCES_DISABLED` | Zet minimaal één bron aan. |
| `CONFIG_DEMO_MODE` | Corrigeer de losse DEMO_MODE-property. |
| `CONFIG_READ_FAILED` | Instellingen konden niet worden gelezen; controleer de projectconfiguratie. |
| `UI_FILE_INDEX` | Het HTML-bestand `Index` ontbreekt of is niet leesbaar. |
| `UI_FILE_STYLES` | Het HTML-bestand `Styles` ontbreekt of is niet leesbaar. |
| `UI_FILE_ANALYTICS` | Het HTML-bestand `Analytics` ontbreekt of is niet leesbaar. |
| `UI_FILE_CLIENT` | Het HTML-bestand `Client` ontbreekt of is niet leesbaar. |
| `UI_INDEX_MARKERS` | De vier HTML-bestanden komen uit verschillende codeversies; neem ze samen over. |
| `PAGE_RENDER_FAILED` | De bestanden zijn gevonden maar HtmlService kon het resultaat niet maken; werk de deployment bij. |

De huidige versie gebruikt geen Apps Script-template-evaluatie meer. `Code.gs` leest de vier UI-bestanden rechtstreeks en voegt ze samen via vaste markeringen in `Index.html`. Dit voorkomt dat een fout in één include wordt verborgen als een algemene templatefout. Neem daarom bij deze wijziging minimaal **Code.gs én Index.html** samen over.

Je kunt in de Apps Script-editor handmatig `diagnoseDashboard_` uitvoeren. De functie controleert toegang, instellingen, de vier bestandsnamen en de samenvoeging. Bij succes staat in het uitvoeringslog alleen `ok: true` en de bestandsgroottes; er worden geen workshopgegevens gelezen of gelogd. Bij een fout toont Apps Script de specifieke foutcode.

Het scherm en het uitvoeringslog tonen alleen vooraf vastgelegde diagnostiek/foutcodes. De inhoud van properties, brongegevens en originele providerfouten wordt niet getoond. De `appsscript.json` in de repository is geldig JSON; houd projectinstellingen in `Config.gs`/Script Properties en voeg geen JavaScript toe aan het manifest.

Neem bij deze fix de bijgewerkte **Code.gs, Config.gs en Client.html** samen over. Behoud je eigen broninstellingen in Config.gs als je die daar beheert. Maak vervolgens een nieuwe versie van de bestaande web-app-implementatie; alleen code opslaan werkt de gepubliceerde `/exec`-versie niet bij.

## 6. Grenzen en foutmeldingen

- Maximaal 15.000 rijen per bron en 30.000 totaal. Overschrijding is een fout, geen stille afkapping. Veel Excel-pagina’s kunnen binnen Apps Script tegen uitvoeringstijd/API-quota aanlopen; limieten zijn geen prestatiegarantie.
- Elke bron wordt afzonderlijk gelezen, zonder cross-provider transactiesnapshot. Wijzigingen tijdens het inladen kunnen dus tussentijds doorwerken. Gebruik rustige momenten voor formele rapportages.
- Bronfouten tonen geen originele providerberichten of celinhoud in de browser/logs. Controleer ID’s, rechten, kopregel, tabelnaam, dubbele aanvraag-ID’s en limieten. Bij Microsoft controleer je daarnaast de koppeling en het tenantbeleid.
- Een geheel mislukte fetch krijgt een foutweergave; een gedeeltelijk mislukte fetch toont alleen de bronnen die wel geladen zijn.
- Contactvelden worden bij normalisatie weggegooid, maar de server leest wel de gebruikte rijen uit de bron. Als ook die leestoegang beperkt moet zijn, maak dan vooraf een apart rapportagebestand met alleen analysekolommen.
- De Microsoft Graph-koppeling en Apps Script-deployment zijn nog niet op echte accounts getest. De repositorytests gebruiken nagebootste providerantwoorden; voer bovenstaande acceptatiestappen uit vóór gebruik voor verantwoording.

## Officiële documentatie

- [Apps Script web-apps en uitvoeringsidentiteit](https://developers.google.com/apps-script/guides/web)
- [Apps Script Session en beschikbaarheid van e-mailadressen](https://developers.google.com/apps-script/reference/base/session)
- [Apps Script web-app manifest](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- [Microsoft Graph: tabelrijen lezen en vereiste rechten](https://learn.microsoft.com/en-us/graph/api/table-list-rows?view=graph-rest-1.0)
- [Microsoft device-code OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)
- [Microsoft refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
