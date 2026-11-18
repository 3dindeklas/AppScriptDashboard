# Bezoekstatistieken voor Workshopkompas

In `__stats` staat één dagregel per Amsterdamse kalenderdag, e-mailadres en toegangsmethode. Per sessie telt de eerste geslaagde opening. Daarna telt openen of herladen opnieuw na minstens 30 minuten zonder geregistreerde activiteit in die sessie. Een bevestigde filterwijziging en een tussentijdse herlaadactie houden dit venster actief. Middernacht wijzigt de dag waarop een actie wordt geboekt, maar begint geen nieuw bezoekvenster. Een nieuw tabblad (Google) of een nieuwe e-mailcodesessie kan direct meetellen. Bronverversing via de knop telt niet als bezoek.

Een bevestigde wijziging van een dashboard- of kalenderfilter telt meteen, onafhankelijk van het bezoekvenster. De tellers staan in **Bezoeken** en **Filterwijzigingen**: een actie voegt doorgaans geen losse rij toe. **Laatste activiteit** verandert bij iedere getelde actie. Filterwaarden worden niet bewaard. Het sessietoken of de browser-ID staat niet in het spreadsheet.

## Inrichten

1. Voeg `Stats.gs` toe in hetzelfde Apps Script-project en neem de nieuwe `usageStats`-instelling over uit `Config.gs`.
2. Open in de Apps Script-editor **Projectinstellingen → Scripteigenschappen** en voeg toe:
   - **Property:** `WORKSHOPKOMPAS_STATS_SPREADSHEET_ID`
   - **Waarde:** het ID van het spreadsheet waarin de gegevens terecht moeten komen (de tekst tussen `/d/` en `/edit`).
3. Zorg dat het uitvoerende account van de web-app **bewerkingstoegang** heeft tot dit spreadsheet. **Gebruik je een apart Apps Script-project voor e-mailcodetoegang?** Dan moet je deze Scripteigenschap óók in dat gastproject instellen: ieder Apps Script-project heeft zijn eigen eigenschappen en autorisaties. Kopieer ook de actuele `Stats.gs` en `Code.gs` naar het gastproject. Publiceer een nieuwe versie van de betreffende web-app en open het dashboard met een toegestaan account.
4. Voer in de Apps Script-editor van **elke deployment** `checkUsageStatsSetup` uit. Deze controle meldt ontbrekende configuratie, een foutieve kopregel of ontbrekende toegang zonder gegevens te wijzigen. Het tabblad `__stats` wordt bij de eerste geslaagde dashboardopening automatisch aangemaakt, met een kopregel en de eerste registratie. Het wordt verborgen als in het spreadsheet nog een ander zichtbaar tabblad bestaat.

Voor het onderdrukken van dubbeltellingen onthoudt Apps Script een **gehashte** sessiemarkering in Scripteigenschappen. Deze wordt met een lock gecontroleerd voordat een bezoek wordt toegevoegd. Markeringen ouder dan de bewaartermijn worden periodiek opgeruimd.

Het spreadsheet-ID staat bewust **niet** in de publieke GitHub-repository. Alternatief voor privé geforkte projecten: vul `usageStats.spreadsheetId` in `Config.gs`; die waarde heeft voorrang op de scripteigenschap. `usageStats.enabled = false` schakelt de registratie uit. Met `usageStats.sheetName` wijzig je de tabbladnaam.

## Kolommen

| Kolom | Betekenis |
| --- | --- |
| Tijdstip | Werkelijk tijdstip als Google Sheets-datum/tijd, weergegeven als `dd-mm-jjjj uu:mm:ss`. De weergave volgt de tijdzone van het spreadsheet. |
| Gebruiker (e-mailadres) | Geverifieerd e-mailadres uit de Google-allowlist of e-mailcodesessie. |
| Toegang | `Google-account` of `E-mailcode`. |
| Gebeurtenis | `Dagtotalen` (historische regels kunnen `Dashboard geopend` bevatten). |
| Dag | Amsterdamse kalenderdag. |
| Bezoeken | Aantal getelde dashboardopeningen. |
| Filterwijzigingen | Aantal bevestigde wijzigingen. |
| Laatste activiteit | Tijdstip van de laatst getelde actie. |

Apps Script geeft niet voor elke toegestane gebruiker een betrouwbare voor- en achternaam terug. Daarom is e-mailadres het identificerende veld; je kunt desgewenst voor interne rapportages een apart, beveiligd namenoverzicht gebruiken. Wachtwoorden, IP-adressen, browserinformatie, tokens, contactpersonen en andere workshopgegevens worden niet opgeslagen.

## Bewaartermijn en veiligheid

De configuratie heeft standaard `retentionDays: 180`. Bij een geslaagd bezoek wordt maximaal eenmaal per UTC-dag geprobeerd om verouderde logregels vanaf het begin van het chronologische log te verwijderen. Bewaar de gegevens gesorteerd zoals ze worden toegevoegd; handmatig sorteren kan de opruimlogica verstoren. Andere bewaartermijn: wijzig `retentionDays` (1 t/m 3650).

Een verborgen werkblad is **geen toegangsbeveiliging**: iedere gebruiker met passende toegang tot het spreadsheet kan het tabblad zichtbaar maken. Beperk daarom de toegang tot het bestand, of gebruik liever een afzonderlijk afgeschermd statistiekenspreadsheet als anderen de overige tabbladen mogen bewerken. Maak duidelijk aan dashboardgebruikers dat het aantal bezoeken met hun e-mailadres wordt bijgehouden en waarvoor.

Registratie is niet kritisch: wanneer het werkblad niet beschikbaar is, de kopregel niet overeenkomt, een lock bezet is of een API-aanroep mislukt, blijft het dashboard normaal werken. Er wordt dan geen bezoek gelogd. Het tabblad mag bestaande gegevens niet automatisch overschrijven.

## Statistieken analyseren

Gebruik in een apart, afgeschermd overzicht een draaitabel op `__stats`: som de kolommen **Bezoeken** en **Filterwijzigingen** per dag, gebruiker of maand. De waarden meten getelde acties, geen minuten dat het dashboard actief was. Voor unieke gebruikers per maand kun je e-mailadressen per maand ontdubbelen in een draaitabel of een aparte analyse.

De huidige opzet schrijft geen bezoekgegevens naar de dashboardbrowser en voegt geen statistieken toe aan de normale live-snapshot. Alleen een willekeurige niet-geheime sessie-ID staat tijdelijk in de browseropslag.

## Als een filterwijziging ontbreekt

Publiceer Code.gs, Stats.gs, Client.html en Planning.html samen. Open de actuele `/exec`-link, wijzig een dropdown naar een andere waarde en kijk of **Filterwijzigingen** en **Laatste activiteit** wijzigen. Staat er een `[STATS_FILTER]`-melding in de browserconsole, vergelijk het tijdstip dan met `trackDashboardFilterChange` en `[STATS_WRITE]` in Apps Script → Uitvoeringen. Controleer bij ontbrekende registratie ook `checkUsageStatsSetup()` in het gebruikte project. Een vernieuwde publicatie vereist dat al geopende tabbladen opnieuw worden geladen.
