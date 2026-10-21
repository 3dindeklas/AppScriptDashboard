# Microsoft 365 als databron

Status: de adapter en geautomatiseerde tests zijn geïmplementeerd in [PR #21](https://github.com/3dindeklas/AppScriptDashboard/pull/21). De koppeling is nog niet met een echte tenant gecontroleerd. Doorloop onderstaande acceptatie voordat de Microsoft-bron als productie-geaccepteerd wordt gemarkeerd. Zie [STATUS.md](STATUS.md).

## Wat je nodig hebt

- Een `.xlsx`-bestand in **OneDrive for Business of SharePoint Online**, met een benoemde Excel-tabel (Invoegen → Tabel), bijvoorbeeld `Workshops`. Een los celbereik of alleen een tabbladnaam volstaat niet. Persoonlijke OneDrive-opslag is niet ondersteund door deze Excel-API.
- Dezelfde kolomkoppen als de Google-bronnen. Een tabel kan elders op het werkblad beginnen; `headerRow` is voor Microsoft niet nodig.
- Een Microsoft werk-/schoolaccount met toegang tot het bestand en toestemming om de app te autoriseren. Tenantbeleid kan beheerderstoestemming vereisen of device-code-aanmelding blokkeren.
- Het Apps Script-project draait **als de eigenaar** (`USER_DEPLOYING`), ook bij tijdtriggers. De Google-eigenaar staat in `allowedEmails`. Bestaande Google-only-installaties kunnen hun uitvoeringsmodel behouden zolang geen Microsoft-bron is ingesteld.

Dit is een koppeling voor de beheerder van de databron. Dashboardbezoekers melden zich niet bij Microsoft aan. De bestaande e-mailcodefunctie voor gastinzage staat hier los van.

## 1. Registreer de Microsoft-app

1. Open Microsoft Entra → App registrations → New registration.
2. Kies accounts binnen je eigen organisatiedirectory (single tenant).
3. Noteer Directory (tenant) ID en Application (client) ID.
4. Voeg Microsoft Graph **Delegated permission `Files.ReadWrite`** toe. De Excel-tabel-API vereist dit recht ook voor lezen; application permissions/client credentials worden niet ondersteund. De dashboardadapter gebruikt uitsluitend GET voor werkboekgegevens en wijzigt geen broncellen.
5. Schakel bij Authentication de public-client/device-code-flow in (**Allow public client flows**). De koppeling vraagt ook `offline_access` voor automatische vernieuwing.
6. Verleen zo nodig tenantbeheerderstoestemming. Maak geen client secret: deze flow gebruikt geen secret of redirect-URL.

## 2. Werk het Apps Script-project bij

Voeg **Microsoft** toe via + → Script. Werk **Data.gs**, **Cache.gs** en **Client.html** tegelijk bij. Alle overige bestanden blijven uit dezelfde actuele versie; behoud eigen toegangsadressen en broninstellingen.

Voeg deze scope toe aan `oauthScopes` in je bestaande `appsscript.json` (behoud de andere scopes):

```json
"https://www.googleapis.com/auth/script.external_request"
```

De repositorymanifesten bevatten deze scope al. De Google-eigenaar moet het nieuwe recht voor externe HTTP-verzoeken opnieuw autoriseren. Publiceer na testen een nieuwe versie van de eigenaar-deployment. Voeg alleen `src/` toe aan Apps Script, geen tests of deploymentvoorbeelden. De claspignore sluit deze mappen uit.

Zet onder **Projectinstellingen → Script Properties**:

| Eigenschap | Waarde |
| --- | --- |
| `MS_TENANT_ID` | Directory-ID uit Entra |
| `MS_CLIENT_ID` | Application-ID uit Entra |
| `MS_GOOGLE_OWNER_EMAIL` | Google-e-mailadres van de Apps Script-eigenaar, ook opgenomen in `allowedEmails` |

Geen tokens, echte bron-ID's of accountadressen committen. `MS_TOKENS` en `MS_PENDING_CONNECTION` beheert de code zelf. Scripteditors kunnen Script Properties lezen; geef alleen vertrouwde beheerders editorrechten. Er is één gedeelde Microsoft-identiteit per Apps Script-project; meerdere Microsoft-bronnen gebruiken hetzelfde account.

## 3. Koppel de Microsoft-identiteit

1. Open de editor als de toegestane Google-eigenaar.
2. Selecteer **beginMicrosoftConnection_** en kies Uitvoeren. Autoriseer Google indien gevraagd.
3. Het uitvoeringslog toont een korte aanmeldcode en `https://microsoft.com/devicelogin`. Gebruik uitsluitend de code van je eigen zojuist gestarte uitvoering. Deel deze code niet.
4. Open die Microsoft-pagina en meld aan als de bedoelde Microsoft-beheerder. Accepteer de gedelegeerde rechten.
5. Selecteer **completeMicrosoftConnection_** in de editor en kies Uitvoeren. Als de aanmelding nog niet rond is: wacht het aangegeven interval en voer opnieuw uit. De functie pollt eenmaal per uitvoering en wacht niet langdurig.
6. Na “Microsoft gekoppeld” zijn access- en refresh-token uitsluitend in Script Properties opgeslagen. De private functies eindigen op `_` en zijn niet vanuit `google.script.run` aan te roepen.

De aanmeldcode heeft de door Microsoft opgegeven geldigheid. Bij verlopen of geweigerde aanmelding: start opnieuw met beginMicrosoftConnection_. Een bestaande werkende koppeling blijft behouden totdat de nieuwe toestemming succesvol is opgeslagen.

## 4. Voeg de Excel-bron toe

Bepaal `driveId` en `itemId` met je Microsoft-beheerder, bijvoorbeeld via de Microsoft Graph Explorer onder hetzelfde account. Voor je eigen zakelijke OneDrive kun je `GET /me/drive` en `GET /me/drive/root:/Map/Bestand.xlsx` gebruiken; voor SharePoint bepaal je de juiste site/documentbibliotheek. Het benodigde `id` van de drive en het `id` van het bestand zijn geen volledige deel-URL's.

Vervang één bron in `APP_CONFIG.sources` of voeg een bron toe:

```javascript
{
  name: 'Tech-hub Microsoft',
  type: 'microsoft',
  driveId: 'VUL_DRIVE_ID_IN',
  itemId: 'VUL_BESTAND_ID_IN',
  tableName: 'Workshops'
}
```

Google-bronnen blijven ongewijzigd werken; een ontbrekend `type` betekent Google Sheets. Voeg geen lege Microsoft-placeholder toe aan een Google-only-configuratie. Iedere ingestelde bron telt mee voor de volledigheidsmelding.

Kies **Data → Brongegevens vernieuwen**. Dezelfde filters, financiële allowlist, datakwaliteitsmeldingen en snapshot werken voor beide providers. Wijzigingen in brontype, locatie, tenant, client of Google-eigenaar maken een bestaande snapshot ongeldig. Na opnieuw koppelen met een ander Microsoft-account binnen dezelfde app: kies altijd bewust Brongegevens vernieuwen; de oude snapshot verloopt anders pas met de gewone TTL.

## Grenzen en herstel

- Maximaal 500 fysieke rijen per Graph-verzoek, normale workshoplimiet maximaal 10.000, maximale scan 20.000 fysieke rijen. Bij afkappen toont de bron een waarschuwing. Het overgeslagen aantal bij Microsoft is een ondergrens. Zie [DATADEFINITIES.md](DATADEFINITIES.md).
- Vermijd lege tabeluitbreidingen en formules die zelf workshopankers invullen. Alleen waarden zijn via deze rij-API beschikbaar.
- Tokens worden onder een UserLock vernieuwd, gescheiden van de ScriptLock voor snapshots. De eigenaar-deployment en eigenaarstriggers zorgen dat alle aanvragen dezelfde tokenlock gebruiken. Een onjuiste effectieve eigenaar wordt geweigerd.
- Een 401 leidt tot hoogstens één tokenvernieuwing en één herhaling. Er is geen eindeloze retry bij 429/503: de bron meldt tijdelijke uitval, andere bronnen blijven beschikbaar. Wacht en vernieuw later.
- `MICROSOFT_RECONNECT_REQUIRED`: voer de eenmalige aanmelding opnieuw uit. Toestemming kan door Microsoft/tenantbeleid worden ingetrokken; automatische vernieuwing is geen garantie op onbeperkte toegang.
- `MICROSOFT_OWNER_REQUIRED`: controleer `MS_GOOGLE_OWNER_EMAIL`, `allowedEmails`, eigenaar-deployment en eigenaar van de tijdtrigger.
- `MICROSOFT_SETUP_REQUIRED`: controleer tenant-/client-ID's in Script Properties.
- `MICROSOFT_GRAPH_HTTP_403`: controleer gedelegeerde toestemming en bestandsrechten. `404`: controleer drive, bestand en tabel. `MICROSOFT_TEMPORARILY_UNAVAILABLE`: wacht en probeer later.
- `MICROSOFT_INVALID_HEADER` of `MICROSOFT_INVALID_ROWS`: controleer dat het een benoemde Excel-tabel is. Ontbrekende verplichte analysekolommen worden door de gedeelde normalisatie afgewezen.
- Browsermeldingen bevatten alleen de vaste bronmelding, `SOURCE_READ_FAILED` en een referentie. Zoek die referentie in Apps Script-uitvoeringen voor de veilige technische code. Providerfoutbodies en tokens worden niet gelogd.
- Ontkoppelen: voer **disconnectMicrosoft_** in de editor uit. Dit verwijdert tokens, een lopende aanmelding en de gedeelde snapshot. Verwijder ook de bron uit Config om de volledigheidsmelding te herstellen. Trek desgewenst de app-toestemming in Microsoft in. Ontkoppelen verwijdert geen bronbestand.
- Zonder Microsoft-bronnen worden geen Microsoft-properties, tokens of Graph-verzoeken gebruikt.

## Praktijkacceptatie (nog open)

- [ ] Appregistratie en toestemming met de echte tenant gecontroleerd.
- [ ] Aanmelden, wachten, afronden en opnieuw koppelen werken vanuit de editor.
- [ ] Eerste laadactie toont zowel Google- als Microsoft-bron met verwachte aantallen.
- [ ] Minimaal 501 tabelrijen worden zonder verdubbeling via paginering gelezen.
- [ ] Lege tabelrijen en meerdere lesdagen leveren dezelfde tellingen als het bronblad.
- [ ] Kosten/facturatie kloppen voor financieel toegestane accounts en ontbreken voor andere accounts.
- [ ] Een volgende opening gebruikt Snapshot; handmatig vernieuwen toont een bronwijziging.
- [ ] Na access-tokenverloop wordt automatisch vernieuwd; de eigenaarstijdtrigger werkt ook.
- [ ] Tijdelijk verkeerde tabelnaam/bestandsrecht maakt alleen de Microsoft-bron onbeschikbaar.
- [ ] Ontkoppelen en intrekken van toestemming werken; er verschijnen geen technische IDs/tokens in de browser.
- [ ] Nieuwe `/exec`-deployment en gastlogin zijn gecontroleerd.

Noteer datum, versie/PR en resultaat in STATUS.md na deze controles. Pas daarna krijgt de Microsoft-praktijkacceptatie de status geaccepteerd.

## Officiële bronnen

- [Microsoft: Excel API en ondersteunde opslag](https://learn.microsoft.com/en-us/graph/api/resources/excel?view=graph-rest-1.0)
- [Microsoft: tabelrijen, rechten en top/skip-paginering](https://learn.microsoft.com/en-us/graph/api/table-list-rows?view=graph-rest-1.0)
- [Microsoft: tabelkop uitlezen](https://learn.microsoft.com/en-us/graph/api/table-headerrowrange?view=graph-rest-1.0)
- [Microsoft: device-code-flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code)
- [Microsoft: refresh-tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
- [Google: UrlFetchApp en external_request](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
- [Google: private functies bij google.script.run](https://developers.google.com/apps-script/guides/html/communication)
